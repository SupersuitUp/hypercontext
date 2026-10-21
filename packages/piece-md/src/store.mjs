// Walking a home: which folders and files are pieces, and which media no piece records.
// Only .md files are ever opened. Media is seen by its name in a directory listing, never read.
import { readdirSync, readFileSync, existsSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readHeader } from '@supersuit/hypercontext-core';
import { NAME, RECORD_FILE, isMedia } from './piece.mjs';

const skip = (name) => name.startsWith('.') || name === 'node_modules';
const rel = (home, p) => relative(home, p).split('\\').join('/') || '.';

function filesUnder(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p, base)); else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

/**
 * Everything under `home`:
 *   pieces     [{layout: 'folder'|'single', name, rel, path, data, hasHeader, members}] (path is the record, or null)
 *   unrecorded [{rel, folder}] media no piece holds, with the folder it is counted under
 *   links      [{rel, target}] symbolic links named like a piece (a .md or a piece-shaped name)
 *
 * A symbolic link is another tree's file, so it is never followed or opened: a dangling one
 * would crash the read, and a live one would count a piece that lives somewhere else.
 */
export function scan(home) {
  const pieces = [], unrecorded = [], links = [];
  const go = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (skip(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) {
        if (e.name.endsWith('.md') || NAME.test(e.name)) links.push({ rel: rel(home, p), target: readlinkSync(p) });
        continue;
      }
      if (e.isDirectory()) {
        const record = join(p, RECORD_FILE);
        if (!existsSync(record) && !NAME.test(e.name)) { go(p); continue; }
        const members = filesUnder(p).filter((m) => m !== RECORD_FILE);
        if (!existsSync(record)) {
          pieces.push({ layout: 'folder', name: e.name, rel: rel(home, p), path: null, data: {}, hasHeader: false, members });
          for (const m of members.filter(isMedia)) unrecorded.push({ rel: `${rel(home, p)}/${m}`, folder: rel(home, p) });
          continue;
        }
        const { data, raw } = readHeader(readFileSync(record, 'utf8'));
        pieces.push({ layout: 'folder', name: e.name, rel: rel(home, p), path: record, data, hasHeader: raw !== '', members });
      } else if (e.name.endsWith('.md')) {
        const { data } = readHeader(readFileSync(p, 'utf8'));
        if (data.kind === 'piece') pieces.push({ layout: 'single', name: e.name.slice(0, -3), rel: rel(home, p), path: p, data, hasHeader: true, members: [] });
      } else if (isMedia(e.name)) {
        unrecorded.push({ rel: rel(home, p), folder: rel(home, dir) });
      }
    }
  };
  go(home);
  return { pieces, unrecorded, links };
}
