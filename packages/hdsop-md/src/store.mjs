// Walking a workflows folder: which files are maps and where the catalog is. One level deep, as
// Supersuit keeps it (kinds.mjs matches `workflows/<name>.md`; freedom-workflows.mjs reads the
// folder with readdirSync). Only markdown is opened.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHeader } from '@supersuit/hypercontext-core';
import { CATALOG_FILE } from './catalog.mjs';

/**
 * A file the folder keeps that is not a map: README.md explains the folder to a person, a name
 * starting `_` is a copy-from (`_TEMPLATE.md`), a dot file is hidden (freedom-workflows.mjs
 * isMapFile, 385-392; kinds.mjs's workflow matcher, 294).
 */
/** What makes a file a map to Supersuit's catalog: a header whose title has a value. */
const MAP_HEAD = /^---\r?\n[\s\S]*?^title:\s*\S/m;

export const notAMap = (name) => name === CATALOG_FILE || name === 'README.md' || name.startsWith('_') || name.startsWith('.');

/**
 * Everything in a workflows folder:
 *   maps     [{name, path, text, data, hasHeader, isMap}] every .md that could be a map, sorted by
 *            name; `isMap` is what Supersuit's catalog counts as one: a header with a title,
 *            tested exactly as freedom-workflows.mjs isMapFile tests it (390)
 *   catalog  {path, text, data, hasHeader} or null
 * A symbolic link is another tree's file, so it is never followed or opened.
 */
export function scan(dir) {
  const maps = [];
  let catalog = null;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const path = join(dir, e.name);
    if (e.name === CATALOG_FILE) {
      const text = readFileSync(path, 'utf8');
      const { data, raw } = readHeader(text);
      catalog = { path, text, data, hasHeader: raw !== '' };
      continue;
    }
    if (notAMap(e.name)) continue;
    const text = readFileSync(path, 'utf8');
    const { data, raw } = readHeader(text);
    const hasHeader = raw !== '';
    maps.push({ name: e.name, path, text, data, hasHeader, isMap: MAP_HEAD.test(text.slice(0, 2000)) });
  }
  return { maps, catalog };
}
