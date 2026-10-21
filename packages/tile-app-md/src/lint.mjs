// The checker: every app.json a folder holds, against the host's rules.
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { findApps } from './store.mjs';
import { checkApp, defaultHome } from './app.mjs';
import { CODES } from './codes.mjs';

/** @typedef {{level: 'error'|'warn', code: string, path: string, message: string}} Finding */

/**
 * Check every app.json under `dir` (an app folder, a workspace, or a folder of apps).
 * @param {string} dir
 * @param {{home?: string}} [opts] the home repo paths resolve against (Supersuit's userHome)
 * @returns {{findings: Finding[], apps: number}} `path` is the app.json's path relative to `dir`
 */
export function lint(dir, { home = defaultHome() } = {}) {
  const findings = [];
  const at = (code, path, message) => findings.push({ level: CODES[code].level, code, path, message });
  const apps = findApps(dir);
  for (const a of apps) {
    if (a.shadowed) { at('id:shadowed', a.rel, `${a.id} is also in a newer folder, which the host reads instead`); continue; }
    if (a.legacy) at('location:legacy', a.rel, `read from ${a.home}/ for one release; it belongs in helm/tile-apps/${a.id}/`);
    let d;
    try { d = JSON.parse(readFileSync(a.file, 'utf8')); }
    catch (e) { at('json:invalid', a.rel, `not valid JSON: ${String(e?.message || e).slice(0, 120)}`); continue; }
    for (const f of checkApp(d, { id: a.id, appDir: dirname(a.file), home })) findings.push({ ...f, path: a.rel });
  }
  const order = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return { findings: findings.sort((x, y) => order(x.path, y.path) || order(x.code, y.code)), apps: apps.length };
}
