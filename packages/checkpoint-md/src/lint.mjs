// The checker: every checkpoint file directly in a folder, judged by checkCheckpoint.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHeader } from '@supersuit/hypercontext-core';
import { checkCheckpoint } from './checkpoint.mjs';

/**
 * The checkpoint files in `dir`: regular `.md` files directly inside it, sorted by name. Supersuit
 * recognises a checkpoint only directly under `checkpoints/`, so sub-folders are not walked, and a
 * symbolic link is never followed (it is another tree's file).
 * @returns {string[]} file names
 */
export function listCheckpoints(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/**
 * @typedef {{level: 'error'|'warn', code: string, file: string, message: string}} Finding
 * Check every checkpoint in `dir`.
 * @returns {{findings: Finding[], checkpoints: number}}
 */
export function lint(dir) {
  const findings = [];
  const names = listCheckpoints(dir);
  for (const name of names) {
    const { data, raw } = readHeader(readFileSync(join(dir, name), 'utf8'));
    for (const f of checkCheckpoint(data, { name, hasHeader: raw !== '' })) findings.push({ ...f, file: name });
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { findings: findings.sort((a, b) => order(a.file, b.file) || order(a.code, b.code)), checkpoints: names.length };
}
