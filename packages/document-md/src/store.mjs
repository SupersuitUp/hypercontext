// Walking a home: which files are documents. A document is a markdown file directly inside a
// folder named documents/ (or artifacts/, the name that folder had before), at any depth, so a
// workspace's own documents/ and every superproject's are both found.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { readHeader } from '@supersuit/hypercontext-core';

export const DOCUMENT_FOLDERS = ['documents', 'artifacts'];
/** Files that are a folder's structure rather than a document, by name. */
export const RESERVED = ['README.md', 'SUPERPROJECT.md', 'PROJECT.md', 'STATE.md', 'ATOMIC-ACTION-MAP.md', 'PLAN.md', 'CLAUDE.md', 'AGENTS.md', 'index.md'];

const skip = (name) => name.startsWith('.') || name === 'node_modules';
const relOf = (home, p) => relative(home, p).split('\\').join('/');

/**
 * Every document under `home`, oldest name first:
 *   documents [{rel, path, name, data, raw, hasHeader}]
 *   pieces    [{rel, path}] bare one-file pieces (`kind: piece`) sitting in a documents folder, which are not documents
 *
 * A symbolic link is another tree's file, so it is never followed or opened: a dangling one would
 * crash the read, and a live one would count a document that lives somewhere else. A directory
 * entry describes the link itself, never its target, so a link is neither a directory (not
 * descended into) nor a file (not read): `isDirectory()` and `isFile()` are the guard.
 */
export function scan(home) {
  const documents = [], pieces = [];
  const go = (dir) => {
    const isDocs = DOCUMENT_FOLDERS.includes(basename(dir));
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (skip(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { go(p); continue; }
      if (!isDocs || !e.isFile() || !e.name.endsWith('.md') || RESERVED.includes(e.name)) continue;
      const { data, raw } = readHeader(readFileSync(p, 'utf8'));
      if (data.kind === 'piece') { pieces.push({ rel: relOf(home, p), path: p }); continue; }
      documents.push({ rel: relOf(home, p), path: p, name: e.name, data, raw, hasHeader: raw !== '' });
    }
  };
  go(home);
  const order = (a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
  return { documents: documents.sort(order), pieces: pieces.sort(order) };
}
