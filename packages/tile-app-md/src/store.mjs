// Finding the app.json files a folder holds, in the order and by the rules the host reads them
// (freedom-app-apps.mjs loadApps): helm/tile-apps/<id>/ first, then tile-apps/<id>/ and apps/<id>/
// for an id not already found; a folder whose name starts with a dot, or that holds no app.json,
// is not an app. statSync follows a link, as the host's does.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { APPS_DIR, LEGACY_APPS_DIRS, RECORD_FILE } from './app.mjs';

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const list = (d) => { try { return readdirSync(d).sort(); } catch { return []; } };

/**
 * @typedef {{id: string, file: string, rel: string, home: string|null, legacy: boolean, shadowed: boolean}} AppFile
 * `rel` is the app.json's path relative to the folder searched, with forward slashes. `home` is the
 * workspace folder it was found in (null when the folder searched was a home of apps or one app).
 */

/** The app folders directly inside `base`, each with an app.json, as the host lists them. */
function appsIn(base) {
  return list(base).filter((id) => !id.startsWith('.') && isDir(join(base, id)) && existsSync(join(base, id, RECORD_FILE)));
}

/**
 * Every app.json `dir` holds. `dir` is one of: an app's own folder (it holds app.json), a workspace
 * (it holds helm/tile-apps/, tile-apps/ or apps/), or a folder of app folders.
 * @returns {AppFile[]}
 */
export function findApps(dir) {
  if (isFile(join(dir, RECORD_FILE))) return [{ id: basename(dir), file: join(dir, RECORD_FILE), rel: RECORD_FILE, home: null, legacy: false, shadowed: false }];
  const homes = [APPS_DIR, ...LEGACY_APPS_DIRS];
  if (homes.some((h) => isDir(join(dir, h)) && !isFile(join(dir, h, RECORD_FILE)))) {
    const out = [], seen = new Set();
    for (const home of homes) {
      for (const id of appsIn(join(dir, home))) {
        out.push({ id, file: join(dir, home, id, RECORD_FILE), rel: `${home}/${id}/${RECORD_FILE}`, home, legacy: home !== APPS_DIR, shadowed: seen.has(id) });
        seen.add(id);
      }
    }
    return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  }
  return appsIn(dir).map((id) => ({ id, file: join(dir, id, RECORD_FILE), rel: `${id}/${RECORD_FILE}`, home: null, legacy: false, shadowed: false }));
}
