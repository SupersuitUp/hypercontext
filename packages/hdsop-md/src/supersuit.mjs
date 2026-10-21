// Whether the Supersuit installed beside a workflows folder keeps a catalog's header, asked of its
// own catalog writer rather than read off a version number.
//
// Supersuit's writer regenerates CATALOG.md on every write. Before freedom-dev 885ae79f3 it counted
// a header as lines it would drop and refused the whole file, so giving a headerless catalog a
// header would have stopped every later write (map-a-workflow's new-map, a row update, a skill
// install). Since then it keeps the header byte for byte. `stamp` gives a headerless catalog the
// minimal header only when every Supersuit it can find keeps one, or when there is none to refuse.
//
// Where it looks: HDSOP_MD_SUPERSUIT (a Supersuit root, or `none`), else the workspace holding the
// workflows folder and the installed plugin at ~/.freedom/plugin.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderCatalog } from './catalog.mjs';
import { CATALOG_HEADER } from './stamp.mjs';

const LIB = join('.agents', 'lib', 'freedom-workflows.mjs');

/** The Supersuit catalog writers that could rewrite this workflows folder's catalog, as file paths. */
export function supersuitWriters(workflowsDir, env = process.env) {
  const named = env.HDSOP_MD_SUPERSUIT;
  if (named === 'none') return [];
  const roots = named ? [named] : [dirname(resolve(workflowsDir)), join(env.HOME || homedir(), '.freedom', 'plugin')];
  return [...new Set(roots.map((r) => resolve(r, LIB)))].filter((f) => existsSync(f));
}

/**
 * Does this writer keep a header? Asked by behaviour: a catalog it rendered, with the minimal
 * header in front, must be one its loss check would rewrite without loss. A writer that cannot be
 * loaded or asked counts as refusing, since a wrong yes stops the catalog taking rows.
 */
export async function writerKeepsHeader(libFile) {
  try {
    const w = await import(pathToFileURL(libFile).href);
    if (typeof w.lossOnRewrite !== 'function') return false;
    const body = typeof w.renderCatalog === 'function' ? w.renderCatalog({ rows: [], note: '' }) : renderCatalog({ rows: [] });
    return w.lossOnRewrite(CATALOG_HEADER + body).length === 0;
  } catch { return false; }
}

/**
 * May a headerless CATALOG.md in this folder be given a header?
 * @returns {Promise<{allowed: boolean, writers: string[], refusing: string[]}>}
 */
export async function catalogHeaderAllowed(workflowsDir, env = process.env) {
  const writers = supersuitWriters(workflowsDir, env);
  const refusing = [];
  for (const f of writers) if (!(await writerKeepsHeader(f))) refusing.push(f);
  return { allowed: refusing.length === 0, writers, refusing };
}
