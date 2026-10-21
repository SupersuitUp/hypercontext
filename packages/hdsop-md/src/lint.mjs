// The checker: every map, the catalog, and the rules that need both (a map no row names, two maps
// claiming one id, a row pointing at nothing). Source: freedom-workflows.mjs check() (478-561).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scan } from './store.mjs';
import { checkMap } from './hdsop.mjs';
import { parseCatalog, checkRows, catalogLosses, CATALOG_FILE } from './catalog.mjs';
import { selfDoc } from './standard.mjs';
import { CODES } from './codes.mjs';

/** The id a map claims, read the way Supersuit allocates ids (freedom-workflows.mjs existingIds, 437). */
const ID = /^id:\s*(HDSOP-[A-Z0-9-]+)\s*$/m;

/**
 * @typedef {{kind: 'hdsop'|'workflow-catalog', level: 'error'|'warn'|'info', code: string, path: string, message: string}} Finding
 * `path` is relative to the workflows folder.
 */

/**
 * Check a workflows folder.
 * @param {string} dir the workflows folder
 * @returns {{findings: Finding[], maps: number, catalog: {exists: boolean, rows: number}}}
 *   `maps` counts the files Supersuit's catalog counts as maps (a header with a title)
 */
export function lint(dir) {
  const { maps, catalog } = scan(dir);
  const findings = [];
  const at = (kind, path) => (f) => findings.push({ kind, level: f.level, code: f.code, path, message: f.message });
  const add = (kind, code, path, message) => at(kind, path)({ level: CODES[kind][code].level, code, message });

  for (const m of maps) checkMap(m.data, { hasHeader: m.hasHeader }).forEach(at('hdsop', m.name));

  let rows = [];
  if (!catalog) add('workflow-catalog', 'catalog:missing', CATALOG_FILE, 'no catalog yet; map-a-workflow starts one');
  else {
    if (!catalog.hasHeader) add('workflow-catalog', 'self-doc:missing', CATALOG_FILE, 'has no header, so it cannot name its standard');
    else { const self = selfDoc('workflow-catalog', catalog.data.standard); if (self) add('workflow-catalog', self.code, CATALOG_FILE, self.message); }
    rows = parseCatalog(catalog.text).rows;
    checkRows(rows, { exists: (cell) => existsSync(resolve(dir, cell)) }).forEach(at('workflow-catalog', CATALOG_FILE));
    const losses = catalogLosses(catalog.text);
    if (losses.length) add('workflow-catalog', 'catalog:not-writable', CATALOG_FILE, `Supersuit's catalog writer would refuse to rewrite it: ${losses.join('; ')}`);

    // A map on disk that no row mentions: written and never scored.
    const listed = new Set(rows.filter((r) => r.map && r.map !== '-').map((r) => resolve(dir, r.map)));
    for (const m of maps) if (m.isMap && !listed.has(resolve(dir, m.name))) add('hdsop', 'map:uncatalogued', m.name, 'a map with no row in the catalog');
  }

  // Two maps claiming one id: the later one, in folder order, is reported.
  const byId = new Map();
  for (const m of maps) {
    if (!m.isMap) continue;
    const id = ID.exec(m.text)?.[1];
    if (!id) continue;
    if (byId.has(id)) add('hdsop', 'id:duplicate', m.name, `${id} is claimed by both ${byId.get(id)} and ${m.name}`);
    else byId.set(id, m.name);
  }

  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    findings: findings.sort((a, b) => order(a.path, b.path) || order(a.code, b.code)),
    maps: maps.filter((m) => m.isMap).length,
    catalog: { exists: Boolean(catalog), rows: rows.length },
  };
}
