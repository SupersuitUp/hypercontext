// The shape of one tile app's app.json, as Supersuit's host reads it.
//
// Every rule here is the host's, never this package's invention. The sources (file:line in
// freedom-dev .agents/lib/ unless named) are listed in docs/FORMAT.md: validateDesc and loadApps in
// freedom-app-apps.mjs decide whether an app loads, reachProblem there decides whether an action
// can run, and the Helm's format.ts decides whether a tile gets an About sheet. The host stops at
// the first problem; this reports every one, each under its own code.
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { bareStandard, standardUrl, classifyStandard } from '@supersuit/hypercontext-core';
import { CODES } from './codes.mjs';

export const KIND = 'tile-app';
export const STANDARD = standardUrl(KIND, 1);
/** The unversioned page: always the latest version. An app.json carrying it predates versions. */
export const STANDARD_LATEST = bareStandard(KIND);
export const IMPLEMENTED_VERSIONS = Object.freeze([1]);
export const RECORD_FILE = 'app.json';
/** Where a workspace keeps its tile apps, and the old homes still read for one release, newest first. */
export const APPS_DIR = 'helm/tile-apps';
export const LEGACY_APPS_DIRS = Object.freeze(['tile-apps', 'apps']);

export const KINDS = Object.freeze(['records', 'custom']);
export const FIELD_TYPES = Object.freeze(['text', 'longtext', 'date', 'number', 'choice', 'checkbox']);
/** A records app's own actions, which an app.json may not declare. */
export const BUILTIN = Object.freeze(['create', 'update', 'delete']);
export const APP_ID = /^[a-z0-9][a-z0-9-]*$/;
const SNAKE = /^[a-z][a-z0-9_]*$/;
/** The reach strings the runner grants (freedom-app-apps.mjs REACH_FORMS). */
export const REACH_FORMS = Object.freeze([/^records$/, /^files:[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/, /^repo:\/.+$/, /^send:one-person$/, /^session$/, /^cloud-files$/,
  /^artifacts:own-pages$/, /^artifacts:read-own-views$/, /^post:cowitness:[a-z][a-z0-9-]{0,30}$/, /^read:delivery-one-person$/]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const within = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
/** The home Supersuit resolves repos against (freedom-workspace.mjs userHome). */
export const defaultHome = () => process.env.FREEDOM_HOME || process.env.HOME || homedir();

/** The real path of `p` when it resolves, through links, to a folder strictly under <home>/Documents/github-repos; else null. */
function repoUnderRoot(p, home) {
  if (typeof p !== 'string' || !isAbsolute(p)) return null;
  try {
    const real = realpathSync(p), root = realpathSync(join(home, 'Documents', 'github-repos'));
    return real !== root && within(root, real) ? real : null;
  } catch { return null; }
}
/** A relative folder that stays inside `base`, judged the way validateDesc does: against a stand-in root. */
const inside = (rel, base = '/x') => !isAbsolute(rel) && within(base, resolve(base, rel));

/** Why a reach list cannot be granted, or null (freedom-app-apps.mjs reachProblem). */
export function reachProblem(reach, home = defaultHome()) {
  for (const r of reach) {
    if (typeof r !== 'string' || !REACH_FORMS.some((re) => re.test(r))) return `reach ${JSON.stringify(r)} is not one the runner grants`;
    if (r.startsWith('files:') && r.split(':')[1].split('/').some((s) => s === '..' || s === '.')) return `reach "${r}" is not one the runner grants`;
    if (r.startsWith('repo:') && !repoUnderRoot(r.slice(5), home)) return `reach "${r}" is outside ~/Documents/github-repos`;
  }
  return null;
}

const answer = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 300;

/**
 * Check one parsed app.json.
 * @param {unknown} d the parsed file
 * @param {{id: string, appDir?: string, home?: string}} ctx `id` is the app's folder name; `appDir` the
 *   folder itself, when the file is on disk (the host then also resolves data against it); `home`
 *   resolves repo paths
 * @returns {{level: 'error'|'warn', code: string, message: string}[]}
 */
export function checkApp(d, { id, appDir = null, home = defaultHome() }) {
  const out = [];
  const add = (code, message) => out.push({ level: CODES[code].level, code, message });
  if (!isObj(d)) { add('json:invalid', 'app.json is not a JSON object'); return out; }

  const s = classifyStandard(KIND, d.standard, [...IMPLEMENTED_VERSIONS]);
  if (d.standard !== undefined && typeof d.standard !== 'string') add('self-doc:missing', `standard is ${JSON.stringify(d.standard)}, not a URL; it should be ${STANDARD}`);
  else if (s.state === 'missing') add('self-doc:missing', `names no standard; it should carry "standard": "${STANDARD}"`);
  else if (s.state === 'bare') add('self-doc:missing', `names ${STANDARD_LATEST}, which predates versions; it should name ${STANDARD} (stamp upgrades it)`);
  else if (s.state === 'unimplemented') add('self-doc:version', `names version ${s.version} of the tile-app standard, which this validator does not implement (it implements ${IMPLEMENTED_VERSIONS.map((v) => `v${v}`).join(', ')})`);
  else if (s.state === 'other') add('self-doc:missing', `names ${d.standard}; a tile app names ${STANDARD}`);

  if (!APP_ID.test(id)) add('folder:name', `folder "${id}" must be lowercase letters, digits and dashes`);
  if (d.id !== id) add('id:mismatch', `id ${JSON.stringify(d.id)} does not match its folder "${id}"`);
  if (typeof d.title !== 'string' || !d.title.trim()) add('title:missing', 'title is missing');
  if (!KINDS.includes(d.kind)) add('kind:value', `kind ${JSON.stringify(d.kind)} is not "records" or "custom"`);
  if (typeof d.summary !== 'string') add('summary:missing', 'summary is missing');

  if (d.kind === 'records') {
    const seen = new Set();
    if (!Array.isArray(d.fields) || !d.fields.length) add('fields:missing', 'a records app needs fields');
    else {
      let longtext = 0;
      for (const f of d.fields) {
        const key = f?.key;
        if (!f || typeof key !== 'string' || !SNAKE.test(key)) { add('field:key', `field key ${JSON.stringify(key)} must be snake_case`); continue; }
        if (seen.has(key)) add('field:repeated', `field "${key}" is repeated`);
        seen.add(key);
        if (!FIELD_TYPES.includes(f.type)) add('field:type', `field "${key}" has an unknown type ${JSON.stringify(f.type)}`);
        if (typeof f.label !== 'string') add('field:label', `field "${key}" has no label`);
        if (f.type === 'choice' && !(Array.isArray(f.choices) && f.choices.length)) add('field:choices', `choice field "${key}" has no choices`);
        if (f.type === 'longtext') longtext++;
      }
      if (longtext > 1) add('field:longtext', `${longtext} longtext fields; at most one (it is the file's body)`);
    }
    if (d.titleField && !seen.has(d.titleField)) add('titleField:value', `titleField "${d.titleField}" is not a field`);
    if (d.sort && !(isObj(d.sort) && seen.has(d.sort.key) && (d.sort.dir === 'asc' || d.sort.dir === 'desc'))) add('sort:value', 'sort must name a field and asc or desc');
    // validateDesc judges data and dir against a stand-in root; loadApps then resolves them against
    // the real app folder or repo and refuses one that escapes it. Both are applied.
    if (typeof d.data === 'string') {
      if (!inside(d.data) || (appDir && !inside(d.data, appDir))) add('data:value', `data "${d.data}" must be a folder inside the app`);
    } else if (typeof d.repo === 'string') {
      const repo = repoUnderRoot(d.repo, home);
      if (!repo) add('repo:value', `repo ${d.repo} is not a folder under ~/Documents/github-repos`);
      if (typeof d.dir !== 'string' || !inside(d.dir) || (repo && !inside(d.dir, repo))) add('dir:value', 'dir must be a folder inside the repo');
    } else add('source:missing', 'a records app needs data or repo');
  }

  const reaches = [];
  if (d.actions !== undefined) {
    if (!isObj(d.actions)) add('actions:value', 'actions must be an object');
    else for (const [name, a] of Object.entries(d.actions)) {
      if (!isObj(a) || typeof a.label !== 'string' || !Array.isArray(a.reach)) add('action:shape', `action "${name}" needs a label and a reach list`);
      else reaches.push([`action "${name}"`, a.reach]);
      if (BUILTIN.includes(name) && d.kind === 'records') add('action:builtin', `action "${name}" is built in`);
    }
  }
  if (d.background !== undefined) {
    if (d.kind !== 'custom') add('background:kind', 'only a custom app has a background');
    else if (!isObj(d.background) || typeof d.background.label !== 'string' || !Array.isArray(d.background.reach)) add('background:shape', 'background needs a label and a reach list');
    else reaches.push(['background', d.background.reach]);
  }
  for (const [what, reach] of reaches) {
    const bad = reachProblem(reach, home);
    if (bad) add('reach:value', `${what}: ${bad}`);
  }

  if (d.about !== undefined && !(isObj(d.about) && answer(d.about.for) && answer(d.about.when))) add('about:value', 'about is {for, when}, each one or two sentences, 1 to 300 characters; the Helm shows no About sheet without it');
  return out;
}
